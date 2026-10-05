/**
 * Called after a user's transactions change (import confirmed or deleted,
 * transaction edited or deleted, merchant renamed or merged) so derived state
 * such as recurring payment detection can be refreshed.
 */
export type TransactionsChanged = (userId: string) => Promise<void>;

export const ignoreChanges: TransactionsChanged = async () => {};
