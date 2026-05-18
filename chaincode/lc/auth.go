package main

import (
	"fmt"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	cid "github.com/hyperledger/fabric-chaincode-go/pkg/cid"
)

// Role definitions
const (
	RoleAdmin    = "admin"
	RoleManager  = "manager"
	RoleOperator = "operator"
)

// checkRole verifies if the caller has the required role attribute or is a CA administrator
func checkRole(APIstub shim.ChaincodeStubInterface, requiredRole string) (bool, error) {
	attr, ok, err := cid.GetAttributeValue(APIstub, "role")
	if err == nil && ok && attr == requiredRole {
		return true, nil
	}

	// If the required role is admin, allow the bootstrap CA Admin to pass
	if requiredRole == RoleAdmin {
		id, err := cid.GetID(APIstub)
		if err == nil && (id == "Admin" || len(id) > 5 && id[:5] == "Admin") {
			return true, nil
		}
	}

	if err != nil {
		return false, fmt.Errorf("failed to retrieve role attribute: %v", err)
	}
	if !ok || attr == "" {
		return false, fmt.Errorf("no role attribute found for the caller")
	}
	if attr != requiredRole {
		return false, nil
	}
	return true, nil
}

// checkAttribute verifies if the caller has a specific attribute with a specific value
func checkAttribute(APIstub shim.ChaincodeStubInterface, attrName string, expectedValue string) (bool, error) {
	val, ok, err := cid.GetAttributeValue(APIstub, attrName)
	if err != nil {
		return false, fmt.Errorf("failed to retrieve attribute %s: %v", attrName, err)
	}
	if !ok || val != expectedValue {
		return false, nil
	}
	return true, nil
}
