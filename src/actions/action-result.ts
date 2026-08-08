export interface ActionCancelled {
	cancelled: true;
	ok: true;
}

export interface ActionFailure {
	message?: string;
	ok: false;
	reason: ActionFailureReason;
}

export type ActionFailureReason = 'conflict' | 'error' | 'missing';

export type ActionResult = ActionCancelled | ActionFailure | ActionSuccess;

export interface ActionSuccess {
	cancelled?: false;
	ok: true;
}
