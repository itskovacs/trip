"""place restroom

Revision ID: a1d9e8f592bf
Revises: f8c71711abc6
Create Date: 2026-01-17 17:07:23.388886

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "a1d9e8f592bf"
down_revision = "f8c71711abc6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("restroom", sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_column("restroom")
