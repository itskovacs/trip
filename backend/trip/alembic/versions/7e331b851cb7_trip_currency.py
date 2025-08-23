"""Trip currency

Revision ID: 7e331b851cb7
Revises: 26c89b7466f2
Create Date: 2025-08-23 15:06:50.387366

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "7e331b851cb7"
down_revision = "26c89b7466f2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("trip", schema=None) as batch_op:
        batch_op.add_column(sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("trip", schema=None) as batch_op:
        batch_op.drop_column("currency")
