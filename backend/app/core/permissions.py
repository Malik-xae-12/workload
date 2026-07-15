from enum import StrEnum

from fastapi import Depends, HTTPException, status

from app.modules.users.models.user import User
from app.modules.auth.dependency import current_active_user


class RoleName(StrEnum):
    ADMIN = "admin"
    USER = "user"


def require_role(*allowed_roles: str):
    """Dependency that checks the authenticated user has at least one of the allowed roles."""

    async def _dependency(
        user: User = Depends(current_active_user),
    ) -> User:
        user_role_names = {role.name for role in user.roles}
        if not user_role_names & set(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _dependency
