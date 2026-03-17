"""backup full

Revision ID: bfbce549e783
Revises: a57a83ca6331
Create Date: 2026-03-16 21:38:42.376176

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "bfbce549e783"
down_revision = "a57a83ca6331"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("backup", schema=None) as batch_op:
        batch_op.add_column(sa.Column("full", sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table("backup", schema=None) as batch_op:
        batch_op.drop_column("full")
