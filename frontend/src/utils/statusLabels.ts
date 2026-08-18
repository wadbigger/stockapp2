import type { QuoteStatus, InvoiceStatus, StockMovementType } from '../types';

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
};

export const quoteStatusColor: Record<QuoteStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  envoye: 'bg-blue-100 text-blue-700',
  accepte: 'bg-green-100 text-green-700',
  refuse: 'bg-red-100 text-red-700',
  expire: 'bg-orange-100 text-orange-700',
};

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  partiellement_payee: 'Partiellement payée',
  payee: 'Payée',
  annulee: 'Annulée',
};

export const invoiceStatusColor: Record<InvoiceStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  emise: 'bg-blue-100 text-blue-700',
  partiellement_payee: 'bg-yellow-100 text-yellow-700',
  payee: 'bg-green-100 text-green-700',
  annulee: 'bg-red-100 text-red-700',
};

export const movementTypeLabel: Record<StockMovementType, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  ajustement: 'Ajustement',
  vente: 'Vente',
};

export const movementTypeColor: Record<StockMovementType, string> = {
  entree: 'bg-green-100 text-green-700',
  sortie: 'bg-red-100 text-red-700',
  ajustement: 'bg-yellow-100 text-yellow-700',
  vente: 'bg-blue-100 text-blue-700',
};
