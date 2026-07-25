"""add datamigration table

Revision ID: 63eaf4ff4e78
Revises: 4e444b9a3b35
Create Date: 2026-07-12 16:32:27.429108

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "63eaf4ff4e78"
down_revision = "4e444b9a3b35"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "datamigration",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_datamigration")),
    )


def downgrade():
    op.drop_table("datamigration")
