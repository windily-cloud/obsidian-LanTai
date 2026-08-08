export type ActionResult = ActionCancelled | ActionFailure | ActionSuccess;

interface ActionCancelled {
	cancelled: true;
	ok: true;
}

interface ActionFailure {
	message?: string;
	ok: false;
	reason: ActionFailureReason;
}

type ActionFailureReason = 'conflict' | 'error' | 'missing';

interface ActionSuccess {
	cancelled?: false;
	ok: true;
}
