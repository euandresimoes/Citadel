import type { BaseButtonProps } from "./BaseButton";
import ButtonPrimary from "./ButtonPrimary";
import { HiOutlineArrowSmRight } from "react-icons/hi";

function ButtonNext({ children = "Next", ...props }: BaseButtonProps) {
  return <ButtonPrimary {...props} icon={<HiOutlineArrowSmRight className="transition-transform group-hover:translate-x-1" aria-hidden="true" />} iconPosition="right" className={`w-full group ${props.className ?? ""}`}><span>{children}</span></ButtonPrimary>;
}

export default ButtonNext;
