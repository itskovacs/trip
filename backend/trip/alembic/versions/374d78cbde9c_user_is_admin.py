"""user is_admin

Revision ID: 374d78cbde9c
Revises: ff887e5acce7
Create Date: 2026-03-28 19:34:24.039891

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "374d78cbde9c"
down_revision = "ff887e5acce7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_admin", sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("is_admin")
