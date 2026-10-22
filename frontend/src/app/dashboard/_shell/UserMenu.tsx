import { FiLogOut } from "react-icons/fi";
import styles from "./Shell.module.css";

type Props = {
  email: string;
  signOutAction: () => Promise<void>;
};

export default function UserMenu({ email, signOutAction }: Props) {
  return (
    <div className={styles.userMenu}>
      <span className={styles.userEmail} title={email}>
        {email}
      </span>
      <form action={signOutAction}>
        <button type="submit" className={styles.signOutButton}>
          <FiLogOut aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );
}
