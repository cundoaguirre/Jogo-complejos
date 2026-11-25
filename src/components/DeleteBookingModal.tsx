import React, { useState } from 'react';
import type { Match } from '../types';
import { permanentlyDeleteBookingInFirestore } from '../lib/firestoreSync';
import { ConfirmDeleteCardModal } from './ConfirmDeleteCardModal';

interface DeleteBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Match | any | null;
  onSuccess?: () => void;
}

export const DeleteBookingModal: React.FC<DeleteBookingModalProps> = ({
  isOpen,
  onClose,
  booking,
  onSuccess
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !booking) return null;

  const clientName =
    booking.userName || booking.clientName || booking.host_name || 'este usuario';

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await permanentlyDeleteBookingInFirestore(booking.id);
      setIsDeleting(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al eliminar la reserva:', err);
      setErrorMessage(
        err?.message ||
          'Ocurrió un error al intentar eliminar la reserva y sus registros asociados.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <ConfirmDeleteCardModal
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) {
          setErrorMessage(null);
          onClose();
        }
      }}
      onConfirm={handleDelete}
      targetName={clientName}
      errorMessage={errorMessage}
      isDeleting={isDeleting}
    />
  );
};

