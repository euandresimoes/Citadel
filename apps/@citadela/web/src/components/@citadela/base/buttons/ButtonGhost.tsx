import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";

function ButtonGhost(props: BaseButtonProps) {
  return <BaseButton {...props} className={`ui-button--ghost ${props.className ?? ""}`} />;
}

export default ButtonGhost;
