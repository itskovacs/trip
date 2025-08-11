"""Trip share

Revision ID: 77027ac49c26
Revises: d5fee6ec85c2
Create Date: 2025-08-09 10:42:28.109690

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "77027ac49c26"
down_revision = "d5fee6ec85c2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tripshare",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_tripshare_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tripshare")),
    )
    with op.batch_alter_table("tripshare", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_tripshare_token"), ["token"], unique=True)


def downgrade():
    with op.batch_alter_table("tripshare", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_tripshare_token"))

    op.drop_table("tripshare")
