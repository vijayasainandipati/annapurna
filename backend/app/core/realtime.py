import uuid
import socketio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.models.user import User

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False
)

# Active connected sessions tracking
connected_users: Dict[str, Dict[str, Any]] = {}

@sio.event
async def connect(sid: str, environ: dict, auth: Optional[dict] = None):
    token = None
    if auth and isinstance(auth, dict) and "token" in auth:
        token = auth["token"]
    elif "QUERY_STRING" in environ:
        from urllib.parse import parse_qs
        params = parse_qs(environ["QUERY_STRING"])
        if "token" in params and params["token"]:
            token = params["token"][0]

    if not token:
        # Refuse connection without valid JWT
        raise socketio.exceptions.ConnectionRefusedError("Authentication required: token missing")

    token_data = decode_access_token(token)
    if not token_data:
        raise socketio.exceptions.ConnectionRefusedError("Authentication failed: invalid or expired token")

    username = token_data.get("sub") if isinstance(token_data, dict) else getattr(token_data, "sub", None)
    if not username:
        raise socketio.exceptions.ConnectionRefusedError("Authentication failed: invalid token subject")

    # Look up user details in DB
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).where(User.username == username))
        user = res.scalar_one_or_none()
        if not user or not user.is_active:
            raise socketio.exceptions.ConnectionRefusedError("User account not found or inactive")

        user_info = {
            "user_id": str(user.id),
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name
        }

    # Save session info
    try:
        await sio.save_session(sid, user_info)
    except Exception:
        pass
    connected_users[sid] = user_info

    # Join role room and individual user room
    role_room = f"role:{user_info['role'].lower()}"
    user_room = f"user:{user_info['user_id']}"
    try:
        await sio.enter_room(sid, role_room)
        await sio.enter_room(sid, user_room)
        await sio.enter_room(sid, "broadcast")

        # Automatically join functional channel rooms based on role
        role = user_info["role"].upper()
        if role in ["ADMIN", "OWNER"]:
            await sio.enter_room(sid, "channel:orders")
            await sio.enter_room(sid, "channel:inventory")
            await sio.enter_room(sid, "channel:production")
            await sio.enter_room(sid, "channel:finance")
        elif role == "SALESMAN":
            await sio.enter_room(sid, "channel:orders")
            await sio.enter_room(sid, "channel:inventory")
        elif role == "PRODUCTION_SUPERVISOR":
            await sio.enter_room(sid, "channel:production")
            await sio.enter_room(sid, "channel:inventory")
        elif role == "ACCOUNTANT":
            await sio.enter_room(sid, "channel:orders")
            await sio.enter_room(sid, "channel:finance")

        # Send handshake confirmation
        await sio.emit("connected", {"status": "ok", "user": user_info}, to=sid)
    except Exception:
        pass

@sio.event
async def disconnect(sid: str):
    if sid in connected_users:
        del connected_users[sid]

class OutboxPublisher:
    """
    Polls and dispatches pending Outbox events to appropriate Socket.IO rooms.
    Ensures PostgreSQL remains the single transactional source of truth.
    """
    @staticmethod
    async def process_pending_events(db: AsyncSession) -> int:
        res = await db.execute(
            select(OutboxEvent)
            .where(OutboxEvent.status == OutboxStatusEnum.PENDING.value)
            .order_by(OutboxEvent.created_at.asc())
            .limit(50)
        )
        events: List[OutboxEvent] = res.scalars().all()
        if not events:
            return 0

        published_count = 0
        for event in events:
            payload = event.payload
            event_type = event.event_type
            channel = event.channel

            # Determine target room based on event channel
            target_rooms = ["broadcast"]
            if channel in ["sales", "orders"]:
                target_rooms.extend(["channel:orders", "role:admin", "role:owner", "role:salesman"])
            elif channel in ["inventory", "stock"]:
                target_rooms.extend(["channel:inventory", "role:admin", "role:owner", "role:production_supervisor"])
            elif channel == "production":
                target_rooms.extend(["channel:production", "role:admin", "role:owner", "role:production_supervisor"])
            elif channel == "finance":
                target_rooms.extend(["channel:finance", "role:admin", "role:owner", "role:accountant"])

            # Broadcast to each target room
            message_data = {
                "event_id": str(event.id),
                "event_type": event_type,
                "channel": channel,
                "payload": payload,
                "timestamp": event.created_at.isoformat()
            }

            for room in target_rooms:
                try:
                    await sio.emit(event_type, message_data, room=room)
                except Exception:
                    pass

            # Mark as published
            event.status = OutboxStatusEnum.PUBLISHED.value
            event.published_at = datetime.now(timezone.utc)
            published_count += 1

        await db.commit()
        return published_count
