import { forwardRef } from 'react';
import { Calendar, Clock, Globe } from 'lucide-react';
import type { InvoiceState } from '../types';
import { amountInWords, computeTotals, fmt2 } from '../lib/calc';
import { LOGO_DATA_URI } from '../assets/logo';

/**
 * Invoice preview — markup is a 1:1 port of the original builder.
 * Do not restyle: the exported PDF renders this node directly.
 */
const InvoicePreview = forwardRef<HTMLDivElement, { state: InvoiceState }>(({ state: s }, ref) => {
  const taxOn = s.taxEnabled;
  const { subtotal, discount, gstRate, gstAmt, total } = computeTotals(s);
  const useSignImage = s.signMode === 'upload' && s.signImage;

  return (
    <div id="invoice" ref={ref}>
      <div className="head">
        <svg className="head-cut" viewBox="0 0 794 132" preserveAspectRatio="none">
          <polygon points="446,0 482,0 362,132 326,132" fill="#c9cfe6" opacity="0.5" />
          <polygon points="520,0 794,0 794,32 584,32" fill="#0e1a3d" />
        </svg>
        <div className="head-row">
          <div>
            <div className="logo-block">
              <img src={LOGO_DATA_URI} alt="ADMEXO logo" />
              <div className="logo-word">
                <span className="ad">AD</span>
                <span className="mexo">MEXO</span>
              </div>
            </div>
            <div className="issued-by">
              Issued by <b>{s.byName}</b>
            </div>
          </div>
          <div className="tax-title">
            <h2>{s.docTitle}</h2>
            <div className="num">{s.invNo}</div>
            {s.showBadge && (
              <div>
                <div className="due-badge"><Calendar size={12} strokeWidth={2.2} /> <span>{s.badgeText}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="meta-strip">
        <div className="m">
          <div className="ic"><Calendar size={15} /></div>
          <div>
            <div className="lbl">INVOICE DATE</div>
            <div className="val">{s.invDate}</div>
          </div>
        </div>
        <div className="m">
          <div className="ic"><Clock size={15} /></div>
          <div>
            <div className="lbl">DUE DATE</div>
            <div className="val">{s.dueDate}</div>
          </div>
        </div>
        <div className="m">
          <div className="ic"><Globe size={15} /></div>
          <div>
            <div className="lbl">CURRENCY</div>
            <div className="val">{s.currency}</div>
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="tag">BILLED BY</div>
          <div className="ent">{s.byName}</div>
          <p style={{ fontWeight: 700 }}>{s.bySub}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{s.byAddress}</p>
          {taxOn && (
            <p className="gst">
              GSTIN: {s.byGstin} &nbsp; | &nbsp; SAC/HSN: {s.bySac}
            </p>
          )}
        </div>
        <div className="card">
          <div className="tag">BILLED TO</div>
          <div className="ent">{s.toName}</div>
          <p>
            Attn: {s.toAttn} &nbsp;|&nbsp; {s.toPhone}
          </p>
          <p>{s.toEmail}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{s.toAddress}</p>
          {taxOn && <p className="gst">GSTIN: {s.toGstin}</p>}
        </div>
      </div>

      <table className="items">
        <thead>
          <tr>
            <th style={{ width: '6%' }}>NO.</th>
            <th style={{ width: taxOn ? '38%' : '48%' }}>SERVICE DESCRIPTION</th>
            {taxOn && <th style={{ width: '14%' }}>SAC/HSN</th>}
            <th style={{ width: '12%' }}>QTY</th>
            <th style={{ width: '16%' }}>RATE</th>
            <th style={{ width: '16%' }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((item, i) => {
            const amt = (item.qty || 0) * (item.rate || 0);
            return (
              <tr key={item.id}>
                <td className="num-col">{i + 1}</td>
                <td>
                  <div className="desc">{item.desc}</div>
                  {item.period && <div className="period">{item.period}</div>}
                </td>
                {taxOn && <td>{item.sac}</td>}
                <td>{item.qty}</td>
                <td className="right">{fmt2(item.rate)}</td>
                <td className="right">{fmt2(amt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="items-note">All amounts are stated in {s.currency}.</div>

      <div className="bottom-cards">
        <div className="card2">
          <h4>BANK TRANSFER DETAILS</h4>
          <div className="kv-row"><span className="k">BENEFICIARY</span><span>{s.bankBenef}</span></div>
          <div className="kv-row"><span className="k">BANK</span><span>{s.bankName}</span></div>
          <div className="kv-row"><span className="k">ACCOUNT NO.</span><span>{s.bankAcNo}</span></div>
          <div className="kv-row"><span className="k">IFSC/SWIFT</span><span>{s.bankIfsc}</span></div>
          <div className="kv-row"><span className="k">ACCOUNT TYPE</span><span>{s.bankAcType}</span></div>
          <div className="kv-row"><span className="k">PAYMENT REF.</span><span>{s.bankRef}</span></div>
        </div>
        <div className="card2">
          <h4>INVOICE SUMMARY</h4>
          <div className="kv-row"><span className="k">Subtotal</span><span>{fmt2(subtotal)}</span></div>
          <div className="kv-row"><span className="k">Discount</span><span>{fmt2(discount)}</span></div>
          {taxOn && (
            <div className="kv-row">
              <span className="k">{s.gstLabel} ({gstRate}%)</span>
              <span>{fmt2(gstAmt)}</span>
            </div>
          )}
          <div className="total-bar">
            <span className="lbl">TOTAL</span>
            <span className="val">{s.currency} {fmt2(total)}</span>
          </div>
        </div>
      </div>

      <div className="notes-card">
        <h4>PAYMENT TERMS &amp; NOTES</h4>
        <ul>
          {s.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <div className="words-sign">
        <div className="words-card">
          <h4>AMOUNT IN WORDS</h4>
          <div className="amt">{amountInWords(total, s.currency)}</div>
        </div>
        <div className="sign-card">
          <div className="sig">
            {useSignImage ? (
              <img src={s.signImage!} alt="signature" />
            ) : (
              <div className="name" style={{ fontFamily: s.signFont }}>{s.signName}</div>
            )}
          </div>
          <div className="title">
            {useSignImage ? `${s.signName}  |  ${s.signTitle}` : s.signTitle}
          </div>
        </div>
      </div>

      <div className="foot">
        <div>
          <span className="fname">{s.footCompany}</span> &nbsp; <span>{s.footRegions}</span>
        </div>
        <div>
          <span>{s.footWeb}</span> &nbsp; Page 1 of 1
        </div>
      </div>
    </div>
  );
});

InvoicePreview.displayName = 'InvoicePreview';
export default InvoicePreview;
