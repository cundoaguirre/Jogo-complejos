/**
 * Configuración centralizada de Canales de Atención y Soporte de Jogo SaaS.
 * 
 * Si un campo está vacío (''), la interfaz de usuario no mostrará enlaces ficticios
 * ni números de teléfono inventados. Configure aquí los valores reales cuando estén disponibles.
 */
export interface JogoSupportConfig {
  // Número de WhatsApp oficial en formato internacional (ej: '54911xxxxxxxx').
  // Dejar vacío '' si aún no está asignado.
  whatsappNumber: string;
  whatsappPrefilledMessage: string;

  // Correo electrónico oficial de soporte (ej: 'soporte@jogo.app').
  // Dejar vacío '' si aún no está asignado.
  email: string;
  emailSubject: string;

  // Instagram o redes sociales oficiales (ej: 'https://instagram.com/jogo.app' o '@jogo.app').
  // Dejar vacío '' si aún no está asignado.
  instagramUrl: string;
  instagramHandle: string;
}

export const SUPPORT_CONFIG: JogoSupportConfig = {
  // Dejar vacíos si no hay datos reales en el proyecto:
  whatsappNumber: '',
  whatsappPrefilledMessage: 'Hola equipo Jogo, necesito consultar sobre el acceso a mi complejo deportivo.',
  email: '',
  emailSubject: 'Consulta de acceso a complejo Jogo SaaS',
  instagramUrl: '',
  instagramHandle: ''
};
