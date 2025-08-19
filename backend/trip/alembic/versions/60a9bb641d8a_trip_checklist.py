"""Trip Checklist

Revision ID: 60a9bb641d8a
Revises: 1181ac441ce5
Create Date: 2025-08-17 21:12:41.336514

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "60a9bb641d8a"
down_revision = "1181ac441ce5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tripchecklistitem",
        sa.Column("text", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("checked", sa.Boolean(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_tripchecklistitem_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user"], ["user.username"], name=op.f("fk_tripchecklistitem_user_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tripchecklistitem")),
    )


def downgrade():
    op.drop_table("tripchecklistitem")
