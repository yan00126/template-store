import React from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

function NavSearch() {
  return (
    <div className="flex items-center">
      <Input
        type="search"
        placeholder="search product..."
        className="max-w-xs dark:bg-muted"
      />
      <Button variant="default" size="lg" className="capitalize m-8">
        click me
      </Button>
    </div>
  );
}

export default NavSearch;
