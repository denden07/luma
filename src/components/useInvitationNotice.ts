import { useOutletContext } from 'react-router-dom';

export type InvitationNoticeActions = { success: (message: string) => void; error: (message: string) => void };

export const useInvitationNotice = () => useOutletContext<InvitationNoticeActions>();
