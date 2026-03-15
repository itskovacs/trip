"""user delete fix ondelete props

Revision ID: 697123905d07
Revises: 06a43bee16cd
Create Date: 2026-03-14 14:42:04.891624

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "697123905d07"
down_revision = "06a43bee16cd"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripitem_place_id_place"), type_="foreignkey")

    with op.batch_alter_table("tripplacelink", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripplacelink_trip_id_trip"), type_="foreignkey")
        batch_op.drop_constraint(batch_op.f("fk_tripplacelink_place_id_place"), type_="foreignkey")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_place_category_id_category"), type_="foreignkey")
        batch_op.create_foreign_key(
            batch_op.f("fk_place_category_id_category"),
            "category",
            ["category_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.create_foreign_key(
            batch_op.f("fk_tripitem_place_id_place"), "place", ["place_id"], ["id"], ondelete="SET NULL"
        )

    with op.batch_alter_table("tripplacelink", schema=None) as batch_op:
        batch_op.create_foreign_key(
            batch_op.f("fk_tripplacelink_place_id_place"), "place", ["place_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_tripplacelink_trip_id_trip"), "trip", ["trip_id"], ["id"], ondelete="CASCADE"
        )


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripitem_place_id_place"), type_="foreignkey")

    with op.batch_alter_table("tripplacelink", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripplacelink_place_id_place"), type_="foreignkey")
        batch_op.drop_constraint(batch_op.f("fk_tripplacelink_trip_id_trip"), type_="foreignkey")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_place_category_id_category"), type_="foreignkey")
        batch_op.create_foreign_key(
            batch_op.f("fk_place_category_id_category"), "category", ["category_id"], ["id"]
        )

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.create_foreign_key(batch_op.f("fk_tripitem_place_id_place"), "place", ["place_id"], ["id"])

    with op.batch_alter_table("tripplacelink", schema=None) as batch_op:
        batch_op.create_foreign_key(
            batch_op.f("fk_tripplacelink_place_id_place"), "place", ["place_id"], ["id"]
        )
        batch_op.create_foreign_key(batch_op.f("fk_tripplacelink_trip_id_trip"), "trip", ["trip_id"], ["id"])
