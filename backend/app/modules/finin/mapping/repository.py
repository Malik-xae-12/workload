"""Local (app.db) access for the Finin template schema — replaces the live
ODBC connection to the Fabric 'Template_lakehouse' item."""

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finin.mapping.models import PollTemplateColumn

_SEED_PATH = Path(__file__).parent / "template_seed.json"


async def ensure_template_seeded(db: AsyncSession) -> None:
    """One-time load of template_seed.json into app.db, if not already done."""
    count = (await db.execute(select(func.count()).select_from(PollTemplateColumn))).scalar_one()
    if count:
        return
    rows = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    db.add_all(PollTemplateColumn(**r) for r in rows)
    await db.commit()


async def get_template_rows(db: AsyncSession) -> list[dict]:
    """Return the template schema as plain dicts, seeding app.db on first use."""
    await ensure_template_seeded(db)
    result = await db.execute(
        select(PollTemplateColumn).order_by(PollTemplateColumn.table_name, PollTemplateColumn.id)
    )
    return [
        {
            "table_name": r.table_name,
            "column_name": r.column_name,
            "data_type": r.data_type or "",
            "is_primary_key": bool(r.is_primary_key),
        }
        for r in result.scalars()
    ]