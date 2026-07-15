from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload

from app.core.permissions import RoleName
from app.modules.users.models.role import Role, UserRole
from app.modules.users.models.user import User


# ── Users ────────────────────────────────────────────────────────────


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalars().first()


async def get_user_by_email_lean(session: AsyncSession, email: str) -> User | None:
    """Fetch user with no relationship loading — fastest possible lookup."""
    result = await session.execute(
        select(User)
        .where(User.email == email)
        .options(noload("*"))
    )
    return result.scalars().first()


# ── Roles ────────────────────────────────────────────────────────────


async def seed_roles(db: AsyncSession) -> None:
    """Ensure all defined roles exist in the database."""
    for role_name in RoleName:
        result = await db.execute(select(Role).where(Role.name == role_name.value))
        if result.scalar_one_or_none() is None:
            db.add(Role(name=role_name.value, description=f"{role_name.value} role"))
    await db.commit()


async def get_role_by_name(db: AsyncSession, name: str) -> Role | None:
    result = await db.execute(select(Role).where(Role.name == name))
    return result.scalar_one_or_none()


async def assign_role_to_user(db: AsyncSession, user_id: str, role_name: str) -> bool:
    """Assign a role to a user. Returns False if role not found or already assigned."""
    role = await get_role_by_name(db, role_name)
    if not role:
        return False

    existing = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role.id,
        )
    )
    if existing.scalar_one_or_none():
        return False

    db.add(UserRole(user_id=str(user_id), role_id=role.id))
    await db.commit()
    return True
