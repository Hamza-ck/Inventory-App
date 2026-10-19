import { Outlet } from 'react-router-dom'
import Nav from './Nav'
import VoucherModal from './VoucherModal'
import InvoicePrintModal from './InvoicePrintModal'
import { VoucherEditorProvider, useVoucherEditor } from '../context/VoucherEditorContext'

function Modals() {
  const { editor, invoice, closeVoucher, closeInvoice } = useVoucherEditor()
  return (
    <>
      <VoucherModal
        key={editor.nonce}
        isOpen={editor.open}
        editingVoucher={editor.voucher}
        initial={editor.initial}
        onClose={closeVoucher}
      />
      <InvoicePrintModal isOpen={Boolean(invoice)} invoice={invoice} onClose={closeInvoice} />
    </>
  )
}

/** Mounted ONCE for all pages: nav bar + the shared modals no longer remount on every navigation. */
export default function Layout() {
  return (
    <VoucherEditorProvider>
      <Nav />
      <Outlet />
      <Modals />
    </VoucherEditorProvider>
  )
}
