from sqlalchemy import Boolean, Column, String, text
from sqlalchemy.orm import relationship
from fastapi_users.db import SQLAlchemyBaseUserTableUUID

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class User(SQLAlchemyBaseUserTableUUID, Base, AuditMixin, SoftDeleteMixin):
    is_sso = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    azure_oid = Column(String(255), nullable=True)

    roles = relationship(
        "Role",
        secondary="user_role",
        back_populates="users",
        lazy="selectin",
    )
