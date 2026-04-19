"use client";

import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

type FormSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	pendingLabel: string;
};

export function FormSubmitButton({
	children,
	className,
	disabled,
	pendingLabel,
	...props
}: FormSubmitButtonProps) {
	const { pending } = useFormStatus();

	return (
		<button
			{...props}
			aria-busy={pending}
			className={cn(
				"disabled:pointer-events-none disabled:opacity-65",
				className,
			)}
			disabled={pending || disabled}
			type={props.type ?? "submit"}
		>
			{pending ? pendingLabel : children}
		</button>
	);
}
