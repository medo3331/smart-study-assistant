'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Star } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import styles from './Testimonials.module.css';

type Testimonial = {
  id: string;
  display_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export default function Testimonials() {
  const { locale } = useLanguage();
  const isArabic = locale === 'ar';
  const [reviews, setReviews] = useState<Testimonial[]>([]);
  const [rating, setRating] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/testimonials', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load reviews');
        const data = await response.json();
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(isArabic ? 'تعذر تحميل الآراء الآن.' : 'Reviews could not be loaded right now.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isArabic]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (rating < 1 || rating > 5) {
      setError(isArabic ? 'اختار تقييمًا من نجمة إلى خمس نجوم.' : 'Choose a rating from 1 to 5 stars.');
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, displayName, comment }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || (isArabic ? 'تعذر إرسال تقييمك.' : 'Your review could not be submitted.'));
      setComment('');
      setDisplayName('');
      setRating(0);
      setNotice(isArabic ? 'شكرًا لمشاركتنا رأيك! هيظهر بعد مراجعته.' : 'Thanks for sharing! Your review will appear after moderation.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (isArabic ? 'حصل خطأ. حاول تاني.' : 'Something went wrong. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.section} id="reviews" aria-labelledby="testimonials-title" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.header}>
        <h2 id="testimonials-title">{isArabic ? 'تجربتك تهمنا' : 'Your experience matters'}</h2>
        <p>{isArabic ? 'استخدمت ماجيكلي؟ شارك تجربتك وساعدنا نطوّرها.' : 'Used Magicly? Share your experience and help us improve.'}</p>
      </div>

      <div className={styles.layout}>
        <div className={styles.reviews} aria-live="polite">
          {loadError ? (
            <p className={styles.state} role="status">{loadError}</p>
          ) : loading ? (
            <p className={styles.state}>{isArabic ? 'بنحمّل آراء الطلاب…' : 'Loading student reviews…'}</p>
          ) : reviews.length ? (
            reviews.map((review) => (
              <article className={styles.review} key={review.id}>
                <div className={styles.stars} aria-label={isArabic ? `${review.rating} من 5 نجوم` : `${review.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < review.rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
                </div>
                <p className={styles.commentText}>{review.comment}</p>
                <div className={styles.reviewer}>
                  <span className={styles.avatar} aria-hidden="true">{review.display_name.slice(0, 1)}</span>
                  <span>{review.display_name}</span>
                </div>
              </article>
            ))
          ) : (
            <div className={styles.empty}>
              <Star size={21} aria-hidden="true" />
              <p>{isArabic ? 'لسه مفيش آراء منشورة. كن أول واحد يشارك تجربته!' : 'No published reviews yet. Be the first to share your experience!'}</p>
            </div>
          )}
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <h3>{isArabic ? 'قيّم تجربتك' : 'Rate your experience'}</h3>
          <p>{isArabic ? 'كل رأي بيساعدنا نخلي ماجيكلي أفضل.' : 'Every review helps us make Magicly better.'}</p>
          <fieldset className={styles.ratingField}>
            <legend>{isArabic ? 'تقييمك' : 'Your rating'}</legend>
            <div className={styles.ratingButtons}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.starButton}
                  aria-label={isArabic ? `${value} نجوم` : `${value} stars`}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                >
                  <Star size={25} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.label}>
            {isArabic ? 'اسم العرض (اختياري)' : 'Display name (optional)'}
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} placeholder={isArabic ? 'مثال: نور' : 'e.g. Noor'} />
          </label>
          <label className={styles.label}>
            {isArabic ? 'اكتب رأيك' : 'Your review'}
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={8} maxLength={700} required rows={4} placeholder={isArabic ? 'إيه أكتر حاجة عجبتك في ماجيكلي؟' : 'What do you like most about Magicly?'} />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.success} role="status">{notice}</p>}
          <button className={styles.submit} type="submit" disabled={sending || !comment.trim()}>
            {sending ? (isArabic ? 'بيتبعت…' : 'Sending…') : (isArabic ? 'إرسال التقييم' : 'Submit review')}
          </button>
          <small className={styles.moderation}>{isArabic ? 'بنراجع الآراء قبل نشرها على الموقع.' : 'Reviews are moderated before appearing publicly.'}</small>
        </form>
      </div>
    </section>
  );
}
