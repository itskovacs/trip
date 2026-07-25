"""bookings attachments

Revision ID: 7eb80d1f723d
Revises: 63eaf4ff4e78
Create Date: 2026-07-19 20:05:48.880818

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = '7eb80d1f723d'
down_revision = '63eaf4ff4e78'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tripbookingattachmentlink',
       sa.Column('booking_id', sa.Integer(), nullable=False),
       sa.Column('attachment_id', sa.Integer(), nullable=False),
       sa.ForeignKeyConstraint(['attachment_id'], ['tripattachment.id'], name=op.f('fk_tripbookingattachmentlink_attachment_id_tripattachment'), ondelete='CASCADE'),
       sa.ForeignKeyConstraint(['booking_id'], ['tripbooking.id'], name=op.f('fk_tripbookingattachmentlink_booking_id_tripbooking'), ondelete='CASCADE'),
       sa.PrimaryKeyConstraint('booking_id', 'attachment_id', name=op.f('pk_tripbookingattachmentlink'))
    )

    with op.batch_alter_table('tripbookingattachmentlink', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tripbookingattachmentlink_booking_id'), ['booking_id'], unique=False)


def downgrade():
    with op.batch_alter_table('tripbookingattachmentlink', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tripbookingattachmentlink_booking_id'))

    op.drop_table('tripbookingattachmentlink')

