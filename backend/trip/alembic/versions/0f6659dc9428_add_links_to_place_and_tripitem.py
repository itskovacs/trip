"""add links to place and tripitem

Revision ID: 0f6659dc9428
Revises: d20008f51378
Create Date: 2026-05-16 22:07:27.694560
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "0f6659dc9428"
down_revision = "d20008f51378"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("links", sa.JSON(), nullable=True))

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("links", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_column("links")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("links")
