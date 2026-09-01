import ButtonDelete from "../../base/buttons/ButtonDelete";
import ButtonPrimary from "../../base/buttons/ButtonPrimary";
import type { PairingRequest } from "../../../../services/@citadela/hub/hubApi";
import "./PairingRequestList.scss";

interface PairingRequestListProps {
  requests: PairingRequest[];
  actingRequestId: string | null;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

function PairingRequestList({ requests, actingRequestId, onApprove, onReject }: PairingRequestListProps) {
  if (requests.length === 0) return <p>No pending pairing requests.</p>;

  return <div className="pairing-request-list">
    {requests.map((request) => {
      const acting = actingRequestId === request.requestId;
      return <article className="pairing-request-list__item" key={request.requestId}>
        <div>
          <strong>{request.deviceId}</strong>
          <p>Fingerprint: {request.identity.fingerprint}</p>
          <small>Requested: {new Date(request.createdAt).toLocaleString()}</small>
        </div>
        <div className="pairing-request-list__actions">
          <ButtonPrimary type="button" disabled={acting} onClick={() => onApprove(request.requestId)}>Approve</ButtonPrimary>
          <ButtonDelete type="button" disabled={acting} onClick={() => onReject(request.requestId)}>Reject</ButtonDelete>
        </div>
      </article>;
    })}
  </div>;
}

export default PairingRequestList;
