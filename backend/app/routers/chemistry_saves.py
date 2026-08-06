import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.chemistry_save import ChemistrySave
from app.models.user import User
from app.schemas.chemistry_save import ChemistrySaveCreate, ChemistrySaveRead, ChemistrySaveUpdate

MAX_PAYLOAD_BYTES = 2 * 1024 * 1024  # 2 MB payload size limit

router = APIRouter(prefix="/api/chemistry/saves", tags=["chemistry-saves"])


def _verify_payload_size(data: dict):
    serialized = json.dumps(data)
    if len(serialized.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Snapshot payload size exceeds 2 MB limit",
        )


@router.post("", response_model=ChemistrySaveRead, status_code=status.HTTP_201_CREATED)
async def create_save(
    payload: ChemistrySaveCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_payload_size(payload.snapshot)

    # 1. Idempotency check
    if payload.idempotency_key:
        stmt = select(ChemistrySave).where(
            ChemistrySave.idempotency_key == payload.idempotency_key,
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            if existing.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to access this save record",
                )
            existing.snapshot = payload.snapshot
            existing.updated_at = datetime.utcnow()
            existing.last_autosaved_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            return existing

    # 2. Create save
    save = ChemistrySave(
        user_id=current_user.id,
        simulation_id=payload.simulation_id,
        experiment_id=payload.experiment_id,
        schema_version=payload.schema_version,
        revision=1,
        status=payload.status,
        idempotency_key=payload.idempotency_key,
        snapshot=payload.snapshot,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_autosaved_at=datetime.utcnow(),
    )
    db.add(save)
    await db.commit()
    await db.refresh(save)
    return save


@router.get("", response_model=List[ChemistrySaveRead])
async def list_saves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChemistrySave).where(ChemistrySave.user_id == current_user.id).order_by(ChemistrySave.updated_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/latest", response_model=ChemistrySaveRead)
async def get_latest_active_save(
    experiment_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChemistrySave).where(
        ChemistrySave.user_id == current_user.id,
        ChemistrySave.status == "active",
    )
    if experiment_id:
        stmt = stmt.where(ChemistrySave.experiment_id == experiment_id)
    stmt = stmt.order_by(ChemistrySave.updated_at.desc())

    res = await db.execute(stmt)
    latest_save = res.scalars().first()
    if not latest_save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active save not found",
        )
    return latest_save


@router.get("/{save_id}", response_model=ChemistrySaveRead)
async def get_save(
    save_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChemistrySave).where(
        ChemistrySave.id == save_id,
        ChemistrySave.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    save = res.scalar_one_or_none()
    if not save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Save not found",
        )
    return save


@router.put("/{save_id}", response_model=ChemistrySaveRead)
async def update_save(
    save_id: str,
    payload: ChemistrySaveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChemistrySave).where(
        ChemistrySave.id == save_id,
        ChemistrySave.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    save = res.scalar_one_or_none()
    if not save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Save not found",
        )

    # Optimistic Concurrency Lock check
    if save.revision != payload.expected_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "revision_conflict",
                "current_revision": save.revision,
                "expected_revision": payload.expected_revision,
            },
        )

    if payload.snapshot is not None:
        _verify_payload_size(payload.snapshot)
        save.snapshot = payload.snapshot

    if payload.status is not None:
        save.status = payload.status

    if payload.schema_version is not None:
        save.schema_version = payload.schema_version

    save.revision += 1
    save.updated_at = datetime.utcnow()
    save.last_autosaved_at = datetime.utcnow()

    await db.commit()
    await db.refresh(save)
    return save


@router.delete("/{save_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_save(
    save_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChemistrySave).where(
        ChemistrySave.id == save_id,
        ChemistrySave.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    save = res.scalar_one_or_none()
    if not save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Save not found",
        )

    await db.delete(save)
    await db.commit()
