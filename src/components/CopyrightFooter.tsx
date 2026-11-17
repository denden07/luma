import './CopyrightFooter.css';

const CopyrightFooter = ({ className = '' }: { className?: string }) => (
  <footer className={`copyright-footer ${className}`.trim()}>
    <small>&copy; {new Date().getFullYear()} madeTogether. All rights reserved.</small>
  </footer>
);

export default CopyrightFooter;
