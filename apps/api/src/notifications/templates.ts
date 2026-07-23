/**
 * Transactional-email templates, EN + FR, as pure functions so they are
 * trivially testable. Plain text for the MVP — HTML can come with the web
 * phase. Amounts are pre-formatted XAF strings.
 */

export type BookingEmailTemplate =
  | 'booking_requested_customer'
  | 'booking_requested_vendor'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_cancelled';

export interface BookingEmailVars {
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  totalXaf: number;
  depositXaf: number | null;
  pickupLocation: string | null;
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

const xaf = (n: number) => `${n.toLocaleString('fr-FR')} XAF`;

export function renderBookingEmail(
  template: BookingEmailTemplate,
  locale: 'en' | 'fr',
  v: BookingEmailVars,
): RenderedEmail {
  const pickup = v.pickupLocation ?? (locale === 'fr' ? 'à convenir' : 'to be arranged');
  const lines = {
    en: {
      ref: `Booking reference: ${v.reference}`,
      car: `Car: ${v.carName}`,
      dates: `Dates: ${v.startDate} to ${v.endDate} (inclusive)`,
      total: `Total: ${xaf(v.totalXaf)}`,
      deposit: v.depositXaf ? `Deposit due: ${xaf(v.depositXaf)}` : '',
      pickup: `Pick-up: ${pickup}`,
      team: 'The Karu team',
    },
    fr: {
      ref: `Référence de réservation : ${v.reference}`,
      car: `Véhicule : ${v.carName}`,
      dates: `Dates : du ${v.startDate} au ${v.endDate} (inclus)`,
      total: `Total : ${xaf(v.totalXaf)}`,
      deposit: v.depositXaf ? `Acompte à régler : ${xaf(v.depositXaf)}` : '',
      pickup: `Prise en charge : ${pickup}`,
      team: "L'équipe Karu",
    },
  }[locale];

  const details = [lines.ref, lines.car, lines.dates, lines.total, lines.deposit, lines.pickup]
    .filter(Boolean)
    .join('\n');

  switch (template) {
    case 'booking_requested_customer':
      return locale === 'fr'
        ? {
            subject: `Karu — demande reçue (${v.reference})`,
            body: `Nous avons bien reçu votre demande de réservation.\n\n${details}\n\nLe loueur confirme généralement sous 24 h. Vous recevrez un e-mail dès que c'est fait.\n\n${lines.team}`,
          }
        : {
            subject: `Karu — request received (${v.reference})`,
            body: `We've received your booking request.\n\n${details}\n\nThe provider usually confirms within 24 hours. We'll email you as soon as they do.\n\n${lines.team}`,
          };
    case 'booking_requested_vendor':
      return locale === 'fr'
        ? {
            subject: `Karu — nouvelle demande de réservation (${v.reference})`,
            body: `Vous avez une nouvelle demande de réservation.\n\n${details}\n\nMerci de confirmer ou refuser sous 24 h depuis votre tableau de bord, ou en répondant à l'équipe Karu.\n\n${lines.team}`,
          }
        : {
            subject: `Karu — new booking request (${v.reference})`,
            body: `You have a new booking request.\n\n${details}\n\nPlease confirm or decline within 24 hours from your dashboard, or by replying to the Karu team.\n\n${lines.team}`,
          };
    case 'booking_confirmed':
      return locale === 'fr'
        ? {
            subject: `Karu — réservation confirmée (${v.reference})`,
            body: `Bonne nouvelle : votre réservation est confirmée !\n\n${details}\n\nPrésentez cette référence à la prise en charge. Besoin d'aide ? Répondez simplement à cet e-mail.\n\n${lines.team}`,
          }
        : {
            subject: `Karu — booking confirmed (${v.reference})`,
            body: `Good news — your booking is confirmed!\n\n${details}\n\nShow this reference at pick-up. Need help? Just reply to this email.\n\n${lines.team}`,
          };
    case 'booking_rejected':
      return locale === 'fr'
        ? {
            subject: `Karu — réservation non disponible (${v.reference})`,
            body: `Malheureusement, le loueur n'a pas pu accepter cette réservation.\n\n${details}\n\nAucun montant ne vous sera prélevé. D'autres véhicules sont disponibles sur Karu.\n\n${lines.team}`,
          }
        : {
            subject: `Karu — booking unavailable (${v.reference})`,
            body: `Unfortunately the provider could not accept this booking.\n\n${details}\n\nYou will not be charged. Other cars are available on Karu.\n\n${lines.team}`,
          };
    case 'booking_cancelled':
      return locale === 'fr'
        ? {
            subject: `Karu — réservation annulée (${v.reference})`,
            body: `Cette réservation a été annulée.\n\n${details}\n\nSi ce n'était pas vous, répondez immédiatement à cet e-mail.\n\n${lines.team}`,
          }
        : {
            subject: `Karu — booking cancelled (${v.reference})`,
            body: `This booking has been cancelled.\n\n${details}\n\nIf this wasn't you, reply to this email immediately.\n\n${lines.team}`,
          };
  }
}
