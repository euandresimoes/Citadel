import ButtonDelete from "../../base/buttons/ButtonDelete";
import ButtonPrimary from "../../base/buttons/ButtonPrimary";
import type { PairingRequest } from "../../../../services/@citadela/hub/hubApi";

interface PairingRequestListProps {
  requests: PairingRequest[];
  actingRequestId: string | null;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

function PairingRequestList({ requests, actingRequestId, onApprove, onReject }: PairingRequestListProps) {
  if (requests.length === 0) return <p className="text-xs text-muted">No pending pairing requests.</p>;

  return <div className="mt-4 flex flex-col gap-2">
    {requests.map((request) => {
      const acting = actingRequestId === request.requestId;
      return <article className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0" key={request.requestId}>
        <div>
          <strong className="text-sm text-primary">{request.deviceId}</strong>
          <p className="mt-1 text-xs text-muted">Fingerprint: {request.identity.fingerprint}</p>
          <small className="text-[11px] text-muted">Requested: {new Date(request.createdAt).toLocaleString()}</small>
        </div>
        <div className="flex shrink-0 gap-2">
          <ButtonPrimary type="button" disabled={acting} onClick={() => onApprove(request.requestId)}>Approve</ButtonPrimary>
          <ButtonDelete type="button" disabled={acting} onClick={() => onReject(request.requestId)}>Reject</ButtonDelete>
        </div>
      </article>;
    })}
  </div>;
}

export default PairingRequestList;
