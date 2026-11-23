from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import require_roles
from app.models.user import User, RoleEnum
from app.models.outbox import OutboxEvent
from app.core.realtime import OutboxPublisher, connected_users

router = APIRouter(prefix="/realtime", tags=["Realtime & Outbox"])

@router.post("/process-outbox")
async def trigger_outbox_processing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.OWNER]))
):
    """
    Manually triggers transactional outbox processing to dispatch pending events to Socket.IO rooms.
    """
    count = await OutboxPublisher.process_pending_events(db)
    return {
        "status": "success",
        "published_events_count": count
    }

@router.get("/events")
async def list_outbox_events(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.OWNER]))
):
    """
    List transactional outbox events with status and payload.
    """
    query = select(OutboxEvent).order_by(OutboxEvent.created_at.desc()).limit(limit)
    if status_filter:
        query = query.where(OutboxEvent.status == status_filter.upper())
    res = await db.execute(query)
    events = res.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "channel": e.channel,
            "payload": e.payload,
            "status": e.status,
            "created_at": e.created_at,
            "published_at": e.published_at
        }
        for e in events
    ]

@router.get("/stats")
async def get_realtime_stats(
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.OWNER]))
):
    """
    Current connected sockets and session distribution.
    """
    return {
        "active_socket_connections": len(connected_users),
        "connected_users": list(connected_users.values())
    }
