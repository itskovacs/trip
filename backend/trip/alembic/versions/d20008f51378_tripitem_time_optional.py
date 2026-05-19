"""tripitem time optional

Revision ID: d20008f51378
Revises: 49c47b1b8d0f
Create Date: 2026-05-12 21:37:08.683190

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "d20008f51378"
down_revision = "49c47b1b8d0f"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column("time", existing_type=sa.VARCHAR(), nullable=True)


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column("time", existing_type=sa.VARCHAR(), nullable=False)
