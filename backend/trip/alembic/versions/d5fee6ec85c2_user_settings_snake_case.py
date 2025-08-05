"""User settings snake case

Revision ID: d5fee6ec85c2
Revises: dd7a55d2ae42
Create Date: 2025-08-03 12:43:33.909182

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "d5fee6ec85c2"
down_revision = "dd7a55d2ae42"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE user RENAME COLUMN mapLat TO map_lat;")
    op.execute("ALTER TABLE user RENAME COLUMN mapLng TO map_lng;")


def downgrade():
    op.execute("ALTER TABLE user RENAME COLUMN map_lat TO mapLat;")
    op.execute("ALTER TABLE user RENAME COLUMN map_lng TO mapLng;")
