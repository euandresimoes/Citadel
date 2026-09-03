import type { BaseButtonProps } from "./BaseButton";
import ButtonSecondary from "./ButtonSecondary";
import { HiOutlineArrowSmLeft } from "react-icons/hi";

function ButtonBack({ children = "Back", ...props }: BaseButtonProps) {
  return <ButtonSecondary {...props} icon={<HiOutlineArrowSmLeft className="transition-transform group-hover:-translate-x-1" aria-hidden="true" />} iconPosition="left" className={`w-full group ${props.className ?? ""}`}><span>{children}</span></ButtonSecondary>;
}

export default ButtonBack;
