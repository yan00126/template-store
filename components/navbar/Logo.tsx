import React from "react";
import Link from "next/link";
import { Button } from "../ui/button";
// import { VscCode } from "react-icons/vsc";
import { PiIsland } from "react-icons/pi";

function Logo() {
  return (
    <Button size="icon" asChild>
      <Link href="/">
        <PiIsland className="w-6 h-6" />
      </Link>
    </Button>
  );
}

export default Logo;
