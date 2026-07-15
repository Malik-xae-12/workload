from fastapi import APIRouter

from app.modules.auth.schema import UserRead, UserUpdate
from app.modules.auth.service import fastapi_users

router = APIRouter(tags=["users"])

router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
)
