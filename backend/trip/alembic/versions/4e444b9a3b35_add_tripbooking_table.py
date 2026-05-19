"""add tripbooking table

Revision ID: 4e444b9a3b35
Revises: 95990b054e57
Create Date: 2026-05-16 22:39:54.295872

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "4e444b9a3b35"
down_revision  = "95990b054e57"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tripbooking",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day_id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False, server_default="generic"),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("reference", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["day_id"], ["tripday.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trip_id"], ["trip.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tripbooking_day_id", "tripbooking", ["day_id"])
    op.create_index("ix_tripbooking_trip_id", "tripbooking", ["trip_id"])


def downgrade():
    op.drop_index("ix_tripbooking_trip_id", table_name="tripbooking")
    op.drop_index("ix_tripbooking_day_id", table_name="tripbooking")
    op.drop_table("tripbooking")
