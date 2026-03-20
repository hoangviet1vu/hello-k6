const defaultHttpReqDurationThreshold = 'p(95)<1000';
const rawHttpReqDurationThreshold =
	__ENV.HTTP_REQ_DURATION_THRESHOLD || defaultHttpReqDurationThreshold;

// If only milliseconds are provided, treat it as p(95)<N.
const httpReqDurationThreshold = /^\d+$/.test(rawHttpReqDurationThreshold)
	? `p(95)<${rawHttpReqDurationThreshold}`
	: rawHttpReqDurationThreshold;

const thresholds = {
	http_req_duration: [httpReqDurationThreshold],
	http_req_failed: ['rate<0.01'],
	checks: ['rate>0.99'],
};

export default thresholds;
