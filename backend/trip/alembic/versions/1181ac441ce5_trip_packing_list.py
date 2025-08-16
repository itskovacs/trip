"""Trip Packing list

Revision ID: 1181ac441ce5
Revises: 77027ac49c26
Create Date: 2025-08-16 11:35:34.870999

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "1181ac441ce5"
down_revision = "77027ac49c26"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trippackinglistitem",
        sa.Column("text", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("qt", sa.Integer(), nullable=True),
        sa.Column(
            "category",
            sa.Enum("CLOTHES", "TOILETRIES", "TECH", "DOCUMENTS", "OTHER", name="packinglistcategoryenum"),
            nullable=True,
        ),
        sa.Column("packed", sa.Boolean(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_trippackinglistitem_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user"], ["user.username"], name=op.f("fk_trippackinglistitem_user_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trippackinglistitem")),
    )


def downgrade():
    op.drop_table("trippackinglistitem")
