"""Locally-stored copy of the Finin poll template schema (dbo.polltemplate).

Why: the Template item can live in ANY Fabric workspace (not necessarily the
project's own), and the project's service principal often isn't granted
access to it there — causing 18456 login failures against
Template_lakehouse's SQL analytics endpoint. The template schema is static
reference data, so instead of a live cross-workspace ODBC call on every
mapping run, it's cached once in app.db (see repository.py) and read
locally. No per-project Fabric access required.
"""

from sqlalchemy import Boolean, Column, Integer, String

from app.db.base import Base


class PollTemplateColumn(Base):
    __tablename__ = "finin_template_columns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    table_name = Column(String(255), nullable=False, index=True)
    column_name = Column(String(255), nullable=False)
    data_type = Column(String(64), nullable=True)
    length = Column(Integer, nullable=True)
    description = Column(String(1024), nullable=True)
    is_primary_key = Column(Boolean, nullable=False, default=False)