/**
 * The signed-in member as the app sees it (decision 009). Organization scope
 * for every query comes from here, never from client input. Safe to share
 * with client components: no hashes, no token.
 */
export type AuthMember = {
  sessionId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  /** Normalized `09…` mobile. */
  mobile: string;
  /** A member holding the operator-issued initial password may only change it. */
  mustChangePassword: boolean;
};
