"""TripMember unique trip_id-user

Revision ID: a57a83ca6331
Revises: 697123905d07
Create Date: 2026-03-15 13:07:38.855741

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "a57a83ca6331"
down_revision = "697123905d07"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripmember", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_tripmember_trip_user", ["trip_id", "user"])


def downgrade():
    with op.batch_alter_table("tripmember", schema=None) as batch_op:
        batch_op.drop_constraint("uq_tripmember_trip_user", type_="unique")
