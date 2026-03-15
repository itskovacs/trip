"""image file_size

Revision ID: 034391a33a0d
Revises: 374d78cbde9c
Create Date: 2026-03-10 21:26:32.322767

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "034391a33a0d"
down_revision = "374d78cbde9c"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("image", schema=None) as batch_op:
        batch_op.add_column(sa.Column("file_size", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("image", schema=None) as batch_op:
        batch_op.drop_column("file_size")
