import { useTranslation } from 'react-i18next';
import type { Review } from '@karu/shared';
import { Rating } from '../ds';
import { Card } from '../ui';
import { ReviewBody } from './ReviewBody';

/** The vendor's review of the customer, shown back to the customer it's about. */
export function ReceivedReview({ review }: { review: Review }) {
  const { t } = useTranslation();
  return (
    <Card className="mt-3 border border-karu-ink/10 p-4">
      <p className="text-sm font-semibold">{t('review.providerRatedYou')}</p>
      <div className="mt-1">
        <Rating value={review.rating} />
      </div>
      <ReviewBody review={review} />
    </Card>
  );
}
