import { type ModalProps, Modal as MuiModal } from '@mui/material';

const Modal = ({ children, ...props }: ModalProps) => {
  return (
    <MuiModal className="fixed inset-0 z-10 flex items-center justify-center" {...props}>
      <div className="mx-4 max-h-5/6 w-full overflow-auto rounded-xl bg-white p-6 sm:mx-auto sm:w-[500px]">
        {children}
      </div>
    </MuiModal>
  );
};

export default Modal;
