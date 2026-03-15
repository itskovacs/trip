"""add MagicLink table

Revision ID: 59206f6e2440
Revises: 034391a33a0d
Create Date: 2026-03-13 19:00:13.464253

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "59206f6e2440"
down_revision = "034391a33a0d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "magiclink",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("expires", sa.DateTime(), nullable=False),
        sa.Column("user", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_magiclink")),
    )
    with op.batch_alter_table("magiclink", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_magiclink_token"), ["token"], unique=True)
        batch_op.create_index(batch_op.f("ix_magiclink_user"), ["user"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_magiclink_user_user"), "user", ["user"], ["username"], ondelete="CASCADE"
        )


def downgrade():
    with op.batch_alter_table("magiclink", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_magiclink_token"))

    op.drop_table("magiclink")
