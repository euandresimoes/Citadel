import type { BaseButtonProps } from "./BaseButton";
import ButtonPrimary from "./ButtonPrimary";
import { HiCheck } from "react-icons/hi";

function ButtonFinish({ children = "Finish", ...props }: BaseButtonProps) {
  return <ButtonPrimary {...props} icon={<HiCheck aria-hidden="true" />} iconPosition="right" className={`w-full ${props.className ?? ""}`}><span>{children}</span></ButtonPrimary>;
}

export default ButtonFinish;
