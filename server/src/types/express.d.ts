declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string | null;
        pseudonym?: string | null;
        isAdmin?: boolean;
        isBanned?: boolean;
      };
    }
  }
}

export {};
