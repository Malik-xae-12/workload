from uuid import uuid4

from sqlalchemy import Column, String, UniqueConstraint, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class Role(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "role"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False, index=True)
    description = Column(String(500), nullable=True)

    users = relationship(
        "User",
        secondary="user_role",
        back_populates="roles",
        lazy="selectin",
    )


class UserRole(Base):
    __tablename__ = "user_role"

    user_id = Column(String(36), ForeignKey("user.id"), primary_key=True)
    role_id = Column(String(36), ForeignKey("role.id"), primary_key=True)
